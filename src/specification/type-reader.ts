import Domain = require("../domain");
var _: _.LoDashStatic = require('lodash');

class Visitor
{
  constructor(protected checker: ts.TypeChecker) {}
  protected symbolName = (node: ts.Node) : string => this.checker.getSymbolAtLocation(node).getName();
}

class EnumVisitor extends Visitor
{
  constructor(private enumNode: ts.EnumDeclaration, checker: ts.TypeChecker) {super(checker)}

  public visit() : Domain.Enum
  {
    let name = this.symbolName(this.enumNode.name);
    let domainEnum = new Domain.Enum(name);
    for (var child of this.enumNode.getChildren())
      this.visitMember(<ts.EnumMember>child, domainEnum);
    return domainEnum;
  }

  private isMember(member : ts.EnumMember, e: Domain.Enum) : boolean
  {
    if (member.kind == ts.SyntaxKind.EnumMember) return true;
    for (var child of member.getChildren())
      this.visitMember(<ts.EnumMember>child, e);
    return false;
  }

  private visitMember(member : ts.EnumMember, e: Domain.Enum)
  {
    if (!this.isMember(member, e)) return;

    var name = this.symbolName(member.name);
    e.members.push(new Domain.EnumMember(name))
  }
}

class InterfaceVisitor extends Visitor
{
  constructor(private interfaceNode : ts.InterfaceDeclaration, checker: ts.TypeChecker) {super(checker)}

  public visit() : Domain.Interface
  {
    let name = this.symbolName(this.interfaceNode.name);
    let domainInterface = new Domain.Interface(name);

    ts.forEachChild(this.interfaceNode, c => this.visitInterfaceProperty(<ts.PropertySignature>c, domainInterface));

    //this.annotate(domainInterface, symbol);
    return domainInterface;
  }

  private isPropertySignature(p: ts.PropertySignature, parent: Domain.Interface) : boolean
  {
    if (p.kind == ts.SyntaxKind.PropertySignature) return true;
    ts.forEachChild(p, c=>this.visitInterfaceProperty(<ts.PropertySignature>c, parent));
    return false;
  }

  private visitInterfaceProperty(p: ts.PropertySignature, parent: Domain.Interface)
  {
    if (!this.isPropertySignature(p, parent)) return;

    let name = this.symbolName(p.name);
    let returnTypeString = "TODO";
    let returnType = this.visitTypeNode(p.type);

    let prop = new Domain.InterfaceProperty(name)
    prop.typeString = returnTypeString;
    prop.type = returnType;
    parent.properties.push(prop);
  }

  private visitTypeNode(t: ts.Node, indent: number = 0) : Domain.Type|Domain.Map|Domain.Array
  {
    switch(t.kind)
    {
      case ts.SyntaxKind.ArrayType : return this.visitArrayType(<ts.ArrayTypeNode>t);
      case ts.SyntaxKind.TypeReference : return this.visitTypeReference(<ts.TypeReferenceNode>t);
      case ts.SyntaxKind.StringKeyword : return new Domain.Type("string");
      case ts.SyntaxKind.BooleanKeyword : return new Domain.Type("boolean");
      case ts.SyntaxKind.AnyKeyword : return new Domain.Type("object");
    }
  }

  private visitArrayType(t : ts.ArrayTypeNode) : Domain.Array
  {
    var array= new Domain.Array();
    var childrenX : ts.Node[] = [];
    ts.forEachChild(t, c => childrenX.push(c));
    var children = _(childrenX).filter(c=> _(this.typeKinds).some(k=> k == c.kind));
    if (children.size() != 1) throw "Expected array to have 1 useable child but saw " + children.size();

    array.of = this.visitTypeNode(children.first());
    return array;
  }
  private visitTypeReference(t : ts.TypeReferenceNode) : Domain.Type|Domain.Map|Domain.Array
  {
    var typeName = t.typeName.getText();
    if (typeName != "map") return new Domain.Type(t.getText());

    var childrenX : ts.Node[] = [];
    ts.forEachChild(t, c => {
      childrenX.push(c)
      ts.forEachChild(c, cc => childrenX.push(cc));
    });
    var children = _(childrenX).filter(c=> _(this.typeKinds).some(k=> k == c.kind));
    if (children.size() != 2) throw "Expected map to have 2 useable children but saw " + children.size();

    var map = new Domain.Map()
    map.key = this.visitTypeNode(children.first());
    map.value = this.visitTypeNode(children.last());
    return map;

  }

  private typeKinds : ts.SyntaxKind[] = [
    ts.SyntaxKind.StringKeyword,
    ts.SyntaxKind.BooleanKeyword,
    ts.SyntaxKind.AnyKeyword,
    ts.SyntaxKind.ArrayType,
    ts.SyntaxKind.TypeReference
  ];

  private annotate(declaration: Domain.TypeDeclaration, symbol: ts.Symbol)
  {
    var documentation = ts.displayPartsToString(symbol.getDocumentationComment());
  }
}

class TypeReader
{
  private checker: ts.TypeChecker;

  interfaces: Domain.Interface[] = [];
  enums: Domain.Enum[] = [];

  constructor(private program: ts.Program)
  {
    this.checker = program.getTypeChecker();
    for (var f of this.program.getSourceFiles())
    {
      if (f.path.match(/ntypescript/)) continue;
      if (!f.path.match(/suggest_request|http_method/)) continue;
      this.visit(f)
    }
  }

  private visit(node: ts.Node)
  {
      switch (node.kind)
      {
        case ts.SyntaxKind.InterfaceDeclaration:
          let iv = new InterfaceVisitor(<ts.InterfaceDeclaration>node, this.checker);
          this.interfaces.push(iv.visit())
          break;

        case ts.SyntaxKind.EnumDeclaration:
          let ev = new EnumVisitor(<ts.EnumDeclaration>node, this.checker);
          this.enums.push(ev.visit())
          break;
      }
      ts.forEachChild(node, c=>this.visit(c));
  }
}
export = TypeReader;
