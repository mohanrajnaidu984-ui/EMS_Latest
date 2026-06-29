using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EMS.Data.Models;

public class Contact
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ContactID { get; set; }

    [StringLength(50)]
    public string? Category { get; set; }

    [StringLength(255)]
    public string? CompanyName { get; set; }

    [Required]
    [StringLength(100)]
    public string ContactName { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Designation { get; set; }

    [StringLength(50)]
    public string? CategoryOfDesignation { get; set; }

    public string? Address1 { get; set; }

    public string? Address2 { get; set; }

    [StringLength(50)]
    public string? FaxNo { get; set; }

    [StringLength(50)]
    public string? Phone { get; set; }

    [StringLength(50)]
    public string? Mobile1 { get; set; }

    [StringLength(50)]
    public string? Mobile2 { get; set; }

    [StringLength(100)]
    public string? EmailId { get; set; }
}
